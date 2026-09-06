import type {
    BenefitCertainty,
    BenefitCombination,
    BenefitRule,
    CalculatedCard,
    Card,
    CombinationStep,
    FundingType,
    MerchantRouteVerification,
    PaymentTarget,
    PromotionOffer,
    PromotionProvider,
    PerformanceRecommendationGoal,
    RecommendationRequest,
    RecommendationResponse,
    TransactionHistory,
    UserBenefitProfile,
    UserCardPerformance,
} from '@/types';
import { calculateBestCards } from './calculation';
import { normalizeSubscriptionProductName } from './subscriptionProducts';
import {
    DEFAULT_SMALL_BENEFIT_THRESHOLD,
    isSmallBenefitAmount,
} from './recommendationPreferences';
import { toPaymentTargetSnapshot } from './paymentTarget';

type WorkingCombination = {
    remainingAmount: number;
    cardChargeBase?: number;
    cardChargeAmount?: number;
    steps: CombinationStep[];
    appliedPromotionIds: Set<string>;
    exclusiveGroups: Set<string>;
    confirmedValue: number;
    conditionalValue: number;
    estimatedValue: number;
    immediateDiscount: number;
    laterReward: number;
    warnings: string[];
    requiredChecks: string[];
    blocksCardBenefit: boolean;
};

export type CombinationEngineInput = Omit<RecommendationRequest, 'brandId'> & {
    target: PaymentTarget;
    cards: Card[];
    rules: BenefitRule[];
    history: TransactionHistory[];
    performances: UserCardPerformance[];
    promotions: PromotionOffer[];
    providers: PromotionProvider[];
    profile: UserBenefitProfile;
    performanceGoals?: PerformanceRecommendationGoal[];
    performanceBenefitMonth?: string;
    routeVerifications?: MerchantRouteVerification[];
    promotionUsage?: Record<string, {
        dailyCount: number;
        dailyAmount?: number;
        monthlyCount: number;
        yearlyCount: number;
        monthlyAmount: number;
    }>;
    now?: Date;
};

export interface CombinationEngineMetrics {
    matchingOfferCount: number;
    calculableOfferCount: number;
    peakWorkingStateCount: number;
    prunedWorkingStateCount: number;
    stateTransitionCount: number;
    generatedCombinationCount: number;
    prunedCombinationCount: number;
    returnedCombinationCount: number;
    searchSpaceLimited: boolean;
    durationMs: number;
}

export interface CombinationEngineOptions {
    maxWorkingStates?: number;
    maxStateTransitions?: number;
    onMetrics?: (metrics: CombinationEngineMetrics) => void;
}

type EnumerationContext = {
    maxWorkingStates: number;
    maxStateTransitions: number;
    metrics: CombinationEngineMetrics;
};

export const DEFAULT_MAX_WORKING_STATES = 2_048;
export const DEFAULT_MAX_STATE_TRANSITIONS = 50_000;

const LIMITED_SEARCH_WARNING = '혜택 후보가 많아 점수가 높은 상위 조합만 계산했어요.';

const immediateActionTypes = new Set([
    'PERCENT',
    'FLAT',
    'FIXED_PRICE',
    'GIFT_CERTIFICATE',
]);

const cloneWorking = (state: WorkingCombination): WorkingCombination => ({
    ...state,
    steps: [...state.steps],
    appliedPromotionIds: new Set(state.appliedPromotionIds),
    exclusiveGroups: new Set(state.exclusiveGroups),
    warnings: [...state.warnings],
    requiredChecks: [...state.requiredChecks],
});

const uniqueStrings = (items: string[]) => [...new Set(items.filter(Boolean))];

const compareText = (left: string, right: string) => {
    if (left === right) return 0;
    return left < right ? -1 : 1;
};

const hashString = (value: string, seed: number) => {
    let hash = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const createDeterministicCombinationId = (value: string) => [
    hashString(value, 0x811c9dc5),
    hashString(value, 0x9e3779b9),
    hashString(value, 0x85ebca6b),
].join('').slice(0, 20);

const getBenefitAmount = (offer: PromotionOffer, basisAmount: number) => {
    const { action } = offer;
    if (action.valueSemantics === 'UP_TO' ||
        offer.condition.calculationMode === 'INFORMATION_ONLY') return 0;
    let benefit = 0;

    if (action.type === 'PERCENT' || action.type === 'POINTS' || action.type === 'CASHBACK') {
        benefit = Math.floor(basisAmount * (action.value / 100));
    } else if (action.type === 'FLAT') {
        benefit = action.value;
    } else if (action.type === 'FIXED_PRICE') {
        benefit = Math.max(0, basisAmount - action.value);
    } else if (action.type === 'GIFT_CERTIFICATE') {
        const faceValue = action.faceValue ?? basisAmount;
        benefit = Math.max(0, Math.min(faceValue, basisAmount) - action.value);
    }

    if (action.maxBenefit) benefit = Math.min(benefit, action.maxBenefit);
    return Math.max(0, Math.min(basisAmount, Math.floor(benefit)));
};

const getBasisAmount = (
    offer: PromotionOffer,
    state: WorkingCombination,
    input: CombinationEngineInput,
) => {
    const basis = offer.condition.amountBasis ?? 'REMAINING_AMOUNT';
    if (basis === 'ORIGINAL_AMOUNT') return input.amount;
    if (basis === 'ELIGIBLE_ITEM_AMOUNT') return input.eligibleItemAmount ?? 0;
    return state.remainingAmount;
};

const matchesChannel = (offer: PromotionOffer, isOnline: boolean) => {
    if (offer.channels.includes('ALL')) return true;
    if (isOnline) {
        return offer.channels.includes('ONLINE') || offer.channels.includes('OFFICIAL_SITE');
    }
    return offer.channels.includes('OFFLINE');
};

const isPublishedAndCurrent = (offer: PromotionOffer, now: Date) => {
    if (offer.status !== 'PUBLISHED') return false;
    if (offer.startsAt && new Date(offer.startsAt) > now) return false;
    if (offer.endsAt && new Date(offer.endsAt) < now) return false;
    return true;
};

const matchesPaymentTarget = (offer: PromotionOffer, target: PaymentTarget) => {
    if (target.kind === 'BRAND') {
        return offer.brandIds.includes(target.brand.id) ||
            offer.categoryIds.includes(target.brand.categoryId) ||
            (offer.brandIds.length === 0 && offer.categoryIds.length === 0);
    }
    return offer.brandIds.length === 0 &&
        offer.categoryIds.length === 0 &&
        offer.condition.applicabilityScope !== 'CATEGORY' &&
        offer.condition.applicabilityScope !== 'PRODUCT_SET' &&
        offer.condition.itemSpecific !== true &&
        offer.condition.amountBasis !== 'ELIGIBLE_ITEM_AMOUNT';
};

const isTelecomEligible = (
    offer: PromotionOffer,
    provider: PromotionProvider | undefined,
    profile: UserBenefitProfile,
) => {
    if (provider?.kind !== 'TELECOM') return true;
    const membership = profile.telecomMemberships.find(item => item.providerId === provider.id);
    if (!membership) return false;
    const allowedTiers = offer.condition.telecomTiers ?? [];
    const membershipTier = membership.tier?.trim().toLocaleUpperCase('ko-KR');
    return allowedTiers.length === 0 || Boolean(
        membershipTier && allowedTiers.some(tier =>
            tier.trim().toLocaleUpperCase('ko-KR') === membershipTier
        )
    );
};

const getMatchingSubscription = (
    offer: PromotionOffer,
    provider: PromotionProvider | undefined,
    profile: UserBenefitProfile,
) => {
    if (provider?.kind !== 'SUBSCRIPTION') return undefined;
    const subscriptions = profile.subscriptions.filter(subscription => (
        subscription.providerId === provider.id
    ));
    const requiredProducts = offer.condition.requiredSubscriptionProducts ?? [];
    if (requiredProducts.length === 0) return subscriptions[0];
    const normalizedRequiredProducts = new Set(
        requiredProducts.map(normalizeSubscriptionProductName)
    );
    return subscriptions.find(subscription => (
        normalizedRequiredProducts.has(
            normalizeSubscriptionProductName(subscription.productName)
        )
    ));
};

const isSubscriptionEligible = (
    offer: PromotionOffer,
    provider: PromotionProvider | undefined,
    profile: UserBenefitProfile,
) => provider?.kind !== 'SUBSCRIPTION' || Boolean(
    getMatchingSubscription(offer, provider, profile)
);

const getOfferProviderName = (
    offer: PromotionOffer,
    provider: PromotionProvider | undefined,
    profile: UserBenefitProfile,
) => {
    const providerName = provider?.name ?? offer.providerId;
    const subscription = getMatchingSubscription(offer, provider, profile);
    return subscription
        ? `${providerName} · ${subscription.productName}`
        : providerName;
};

const getEffectiveCertainty = (
    offer: PromotionOffer,
    confirmedConditionIds: Set<string>,
): BenefitCertainty => {
    const needsConfirmation = offer.condition.requiresCoupon ||
        offer.condition.requiresEnrollment ||
        offer.condition.firstPaymentOnly ||
        offer.condition.confirmationRequired ||
        offer.condition.manualCheckRequired;
    if (needsConfirmation && !confirmedConditionIds.has(offer.id)) return 'CONDITIONAL';
    return offer.certainty;
};

const addValue = (
    state: WorkingCombination,
    certainty: BenefitCertainty,
    amount: number,
) => {
    if (certainty === 'CONFIRMED') state.confirmedValue += amount;
    if (certainty === 'CONDITIONAL') state.conditionalValue += amount;
    if (certainty === 'ESTIMATED') state.estimatedValue += amount;
};

const getConfirmationLabel = (offer: PromotionOffer) => {
    if (offer.condition.requiredNote) return offer.condition.requiredNote;
    const labels = [];
    if (offer.condition.requiresCoupon) labels.push('쿠폰 다운로드');
    if (offer.condition.requiresEnrollment) labels.push('행사 응모');
    if (offer.condition.firstPaymentOnly) labels.push('첫 결제 대상');
    if (offer.condition.confirmationRequired) labels.push('행사 대상 여부');
    if (offer.condition.manualCheckRequired) labels.push('추가 조건');
    return labels.length > 0 ? `${labels.join('·')} 확인` : '';
};

const canApplyOffer = (
    offer: PromotionOffer,
    state: WorkingCombination,
    payProviderId: string | undefined,
    allOffers: PromotionOffer[],
    fundingType?: FundingType,
) => {
    if (state.appliedPromotionIds.has(offer.id)) return false;

    const requiredPayIds = offer.compatibility.requiredPayProviderIds ?? [];
    if (requiredPayIds.length > 0 && (!payProviderId || !requiredPayIds.includes(payProviderId))) {
        return false;
    }

    const allowedFundingTypes = offer.compatibility.allowedFundingTypes ?? [];
    if (fundingType && allowedFundingTypes.length > 0 && !allowedFundingTypes.includes(fundingType)) {
        return false;
    }

    const excludedIds = new Set(offer.compatibility.excludedPromotionIds ?? []);
    if ([...state.appliedPromotionIds].some(id => excludedIds.has(id))) return false;
    if ([...state.appliedPromotionIds].some(id =>
        (allOffers.find(item => item.id === id)?.compatibility.excludedPromotionIds ?? [])
            .includes(offer.id)
    )) return false;

    const group = offer.compatibility.exclusiveGroup ||
        (offer.compatibility.allowStackWithSameLayer
            ? undefined
            : `${offer.layer}:${offer.providerId}`);
    return !group || !state.exclusiveGroups.has(group);
};

const applyOffer = (
    offer: PromotionOffer,
    state: WorkingCombination,
    input: CombinationEngineInput,
    providerById: Map<string, PromotionProvider>,
    confirmedConditionIds: Set<string>,
) => {
    const next = cloneWorking(state);
    const usage = input.promotionUsage?.[offer.id];
    if (
        (offer.limitConfig.dailyCount && (usage?.dailyCount ?? 0) >= offer.limitConfig.dailyCount) ||
        (offer.limitConfig.dailyAmount && (usage?.dailyAmount ?? 0) >= offer.limitConfig.dailyAmount) ||
        (offer.limitConfig.monthlyCount && (usage?.monthlyCount ?? 0) >= offer.limitConfig.monthlyCount) ||
        (offer.limitConfig.yearlyCount && (usage?.yearlyCount ?? 0) >= offer.limitConfig.yearlyCount) ||
        (offer.limitConfig.monthlyAmount && (usage?.monthlyAmount ?? 0) >= offer.limitConfig.monthlyAmount)
    ) {
        return null;
    }
    const basisAmount = getBasisAmount(offer, next, input);
    const minSpend = offer.condition.minSpend ?? 0;
    if (basisAmount < minSpend) return null;

    let benefitAmount = getBenefitAmount(offer, basisAmount);
    if (offer.action.type === 'POINTS') {
        benefitAmount = Math.floor(benefitAmount * input.profile.pointValue);
    }
    if (offer.limitConfig.dailyAmount) {
        benefitAmount = Math.min(
            benefitAmount,
            Math.max(0, offer.limitConfig.dailyAmount - (usage?.dailyAmount ?? 0))
        );
    }
    if (offer.limitConfig.monthlyAmount) {
        benefitAmount = Math.min(
            benefitAmount,
            Math.max(0, offer.limitConfig.monthlyAmount - (usage?.monthlyAmount ?? 0))
        );
    }
    if (benefitAmount <= 0) return null;

    const certainty = getEffectiveCertainty(offer, confirmedConditionIds);
    const isImmediate = offer.layer !== 'POST_REWARD' &&
        immediateActionTypes.has(offer.action.type);
    const amountBefore = next.remainingAmount;
    if (isImmediate) {
        next.remainingAmount = Math.max(0, next.remainingAmount - benefitAmount);
        next.immediateDiscount += benefitAmount;
    } else {
        next.laterReward += benefitAmount;
    }

    if (offer.action.type === 'GIFT_CERTIFICATE') {
        const faceValue = offer.action.faceValue ?? basisAmount;
        next.cardChargeBase = offer.compatibility.allowResidualPayment
            ? Math.max(0, amountBefore - faceValue)
            : 0;
    }

    addValue(next, certainty, benefitAmount);
    next.appliedPromotionIds.add(offer.id);
    const group = offer.compatibility.exclusiveGroup ||
        (offer.compatibility.allowStackWithSameLayer
            ? undefined
            : `${offer.layer}:${offer.providerId}`);
    if (group) next.exclusiveGroups.add(group);
    next.blocksCardBenefit ||= Boolean(offer.compatibility.blocksCardBenefit);

    const confirmationLabel = getConfirmationLabel(offer);
    if (certainty === 'CONDITIONAL' && confirmationLabel) {
        next.requiredChecks.push(confirmationLabel);
    }

    next.steps.push({
        id: `promotion:${offer.id}`,
        promotionId: offer.id,
        layer: offer.layer,
        providerId: offer.providerId,
        providerName: getOfferProviderName(
            offer,
            providerById.get(offer.providerId),
            input.profile,
        ),
        title: offer.title,
        certainty,
        amountBefore,
        benefitAmount,
        amountAfter: next.remainingAmount,
        isImmediate,
        ...(confirmationLabel && certainty === 'CONDITIONAL'
            ? { warning: confirmationLabel }
            : {}),
    });
    return next;
};

const compareWorkingStates = (a: WorkingCombination, b: WorkingCombination) => {
    if (b.confirmedValue !== a.confirmedValue) return b.confirmedValue - a.confirmedValue;
    if (b.immediateDiscount !== a.immediateDiscount) {
        return b.immediateDiscount - a.immediateDiscount;
    }
    const bPotential = b.conditionalValue + b.estimatedValue;
    const aPotential = a.conditionalValue + a.estimatedValue;
    if (bPotential !== aPotential) return bPotential - aPotential;
    if (a.remainingAmount !== b.remainingAmount) return a.remainingAmount - b.remainingAmount;
    if (b.laterReward !== a.laterReward) return b.laterReward - a.laterReward;
    if (a.requiredChecks.length !== b.requiredChecks.length) {
        return a.requiredChecks.length - b.requiredChecks.length;
    }
    return compareText(
        a.steps.map(step => step.id).join('\u0000'),
        b.steps.map(step => step.id).join('\u0000'),
    );
};

const limitWorkingStates = (
    states: WorkingCombination[],
    context: EnumerationContext,
) => {
    context.metrics.peakWorkingStateCount = Math.max(
        context.metrics.peakWorkingStateCount,
        states.length,
    );
    if (states.length <= context.maxWorkingStates) return states;

    context.metrics.searchSpaceLimited = true;
    context.metrics.prunedWorkingStateCount += states.length - context.maxWorkingStates;
    return states.sort(compareWorkingStates).slice(0, context.maxWorkingStates);
};

const enumerateOfferSubsets = (
    initialStates: WorkingCombination[],
    offers: PromotionOffer[],
    input: CombinationEngineInput,
    providerById: Map<string, PromotionProvider>,
    confirmedConditionIds: Set<string>,
    context: EnumerationContext,
    payProviderId?: string,
    fundingType?: FundingType,
) => {
    let states = initialStates;

    for (const offer of offers) {
        if (context.metrics.stateTransitionCount >= context.maxStateTransitions) {
            context.metrics.searchSpaceLimited = true;
            break;
        }

        const added: WorkingCombination[] = [];
        for (const state of states) {
            if (context.metrics.stateTransitionCount >= context.maxStateTransitions) {
                context.metrics.searchSpaceLimited = true;
                break;
            }
            context.metrics.stateTransitionCount += 1;
            if (!canApplyOffer(offer, state, payProviderId, input.promotions, fundingType)) continue;
            const applied = applyOffer(
                offer,
                state,
                input,
                providerById,
                confirmedConditionIds,
            );
            if (applied) added.push(applied);
        }
        states = limitWorkingStates([...states, ...added], context);
    }

    return states;
};

const getRouteCertainty = (
    input: CombinationEngineInput,
    card: Card,
    payProviderId?: string,
): { eligible: boolean; certainty: BenefitCertainty; warning?: string } => {
    if (!payProviderId) return { eligible: true, certainty: 'CONFIRMED' };
    if (input.target.kind === 'GENERAL') {
        return {
            eligible: true,
            certainty: 'ESTIMATED',
            warning: '간편결제 승인 가맹점·MCC에 따라 카드 혜택이 제외될 수 있어요.',
        };
    }
    const requestedChannel = input.isOnline ? 'ONLINE' : 'OFFLINE';
    const brandId = input.target.brand.id;
    const verification = input.routeVerifications?.find(item =>
        item.brandId === brandId &&
        item.payProviderId === payProviderId &&
        (!item.cardCompany || item.cardCompany === card.company) &&
        (item.channel === 'ALL' || item.channel === requestedChannel)
    );

    if (!verification) {
        return {
            eligible: true,
            certainty: 'ESTIMATED',
            warning: '간편결제 승인 가맹점·MCC에 따라 카드 혜택이 제외될 수 있어요.',
        };
    }
    return {
        eligible: verification.cardBenefitEligible,
        certainty: verification.certainty,
        ...(!verification.cardBenefitEligible
            ? { warning: '이 결제 경로에서는 카드 혜택이 제외돼요.' }
            : {}),
    };
};

const addCardSteps = (
    state: WorkingCombination,
    card: CalculatedCard,
    route: ReturnType<typeof getRouteCertainty>,
) => {
    const next = cloneWorking(state);
    if (!route.eligible || card.calculatedDiscount <= 0) {
        if (route.warning) next.warnings.push(route.warning);
        return next;
    }

    if (route.warning) next.warnings.push(route.warning);
    card.matchedBenefits.forEach((benefit, index) => {
        const benefitAmount = Math.min(next.remainingAmount, benefit.discount);
        if (benefitAmount <= 0) return;
        const certainty = benefit.certainty === 'CONDITIONAL'
            ? 'CONDITIONAL'
            : route.certainty;
        addValue(next, certainty, benefitAmount);
        next.immediateDiscount += benefitAmount;
        const amountBefore = next.remainingAmount;
        next.remainingAmount = Math.max(0, next.remainingAmount - benefitAmount);
        const confirmationLabel = benefit.requiredChecks.join(' · ');
        if (certainty === 'CONDITIONAL') {
            next.requiredChecks.push(...benefit.requiredChecks);
        }
        next.steps.push({
            id: `card:${card.id}:${benefit.rule.id}`,
            layer: 'PAYMENT_METHOD',
            providerName: card.company,
            title: benefit.rule.description,
            certainty,
            amountBefore,
            benefitAmount,
            amountAfter: next.remainingAmount,
            isImmediate: true,
            cardId: card.id,
            ruleId: benefit.rule.id,
            ...(benefit.confirmationId && { confirmationId: benefit.confirmationId }),
            ...((confirmationLabel || (index === 0 && route.warning)) && {
                warning: confirmationLabel || route.warning,
            }),
        });
    });
    return next;
};

const combinationId = (
    state: WorkingCombination,
    payProviderId: string | undefined,
    fundingType: FundingType,
    cardId?: string,
) => createDeterministicCombinationId(JSON.stringify({
        payProviderId,
        fundingType,
        cardId,
        steps: state.steps.map(step => step.id),
    }));

const getPerformanceProgress = (
    input: CombinationEngineInput,
    state: WorkingCombination,
    card?: Card,
) => {
    if (!card || !input.performanceBenefitMonth) {
        return undefined;
    }
    const performance = input.performanceGoals?.find(item => (
        item.cardId === card.id &&
        item.targetAmount !== undefined &&
        item.targetAmount > item.amount
    ));
    const contributionAmount = Math.max(0, Math.floor(state.cardChargeAmount ?? 0));
    if (!performance?.targetAmount || contributionAmount <= 0) return undefined;

    const remainingBefore = performance.targetAmount - performance.amount;
    const projectedAmount = performance.amount + contributionAmount;
    const remainingAfter = Math.max(0, performance.targetAmount - projectedAmount);

    return {
        performanceMonth: performance.performanceMonth,
        benefitMonth: input.performanceBenefitMonth,
        currentAmount: performance.amount,
        targetAmount: performance.targetAmount,
        contributionAmount,
        projectedAmount,
        remainingBefore,
        remainingAfter,
        targetReached: remainingAfter === 0,
        goalSource: performance.source,
        projectedBenefitAmount: performance.projectedBenefitAmount,
    };
};

const toCombination = (
    state: WorkingCombination,
    providerById: Map<string, PromotionProvider>,
    payProviderId: string | undefined,
    fundingType: FundingType,
    card: Card | undefined,
    input: CombinationEngineInput,
): BenefitCombination => {
    const performanceProgress = getPerformanceProgress(input, state, card);
    return {
        id: combinationId(state, payProviderId, fundingType, card?.id),
        ...(payProviderId && { payProviderId }),
        ...(payProviderId && {
            payProviderName: providerById.get(payProviderId)?.name ?? payProviderId,
        }),
        fundingType,
        ...(card && { cardId: card.id, cardName: card.name }),
        steps: state.steps,
        confirmedValue: state.confirmedValue,
        conditionalValue: state.conditionalValue,
        estimatedValue: state.estimatedValue,
        immediateDiscount: state.immediateDiscount,
        laterReward: state.laterReward,
        payableAmount: Math.max(0, state.remainingAmount),
        ...(performanceProgress && { performanceProgress }),
        warnings: uniqueStrings(state.warnings),
        requiredChecks: uniqueStrings(state.requiredChecks),
    };
};

const compareCombinations = (a: BenefitCombination, b: BenefitCombination) => {
    if (b.confirmedValue !== a.confirmedValue) return b.confirmedValue - a.confirmedValue;
    if (b.immediateDiscount !== a.immediateDiscount) {
        return b.immediateDiscount - a.immediateDiscount;
    }
    if (a.payableAmount !== b.payableAmount) return a.payableAmount - b.payableAmount;
    if (a.requiredChecks.length !== b.requiredChecks.length) {
        return a.requiredChecks.length - b.requiredChecks.length;
    }
    const bPotential = b.conditionalValue + b.estimatedValue;
    const aPotential = a.conditionalValue + a.estimatedValue;
    return bPotential - aPotential || compareText(a.id, b.id);
};

const comparePerformanceProgress = (a: BenefitCombination, b: BenefitCombination) => {
    const aProgress = a.performanceProgress;
    const bProgress = b.performanceProgress;
    if (Boolean(aProgress) !== Boolean(bProgress)) return bProgress ? 1 : -1;
    if (aProgress && bProgress) {
        if (aProgress.targetReached !== bProgress.targetReached) {
            return bProgress.targetReached ? 1 : -1;
        }
        if (aProgress.projectedBenefitAmount !== bProgress.projectedBenefitAmount) {
            return bProgress.projectedBenefitAmount - aProgress.projectedBenefitAmount;
        }
        const aApplied = Math.min(aProgress.contributionAmount, aProgress.remainingBefore);
        const bApplied = Math.min(bProgress.contributionAmount, bProgress.remainingBefore);
        if (aApplied !== bApplied) return bApplied - aApplied;
        if (aProgress.remainingAfter !== bProgress.remainingAfter) {
            return aProgress.remainingAfter - bProgress.remainingAfter;
        }
    }
    return 0;
};

const comparePerformanceCombinations = (a: BenefitCombination, b: BenefitCombination) =>
    comparePerformanceProgress(a, b) || compareCombinations(a, b);

const compareBenefitCombinations = (
    a: BenefitCombination,
    b: BenefitCombination,
    smallBenefitThreshold: number,
) => {
    const aHasMeaningfulBenefit = a.confirmedValue > 0 &&
        !isSmallBenefitAmount(a.confirmedValue, smallBenefitThreshold);
    const bHasMeaningfulBenefit = b.confirmedValue > 0 &&
        !isSmallBenefitAmount(b.confirmedValue, smallBenefitThreshold);
    if (aHasMeaningfulBenefit !== bHasMeaningfulBenefit) {
        return bHasMeaningfulBenefit ? 1 : -1;
    }
    if (!aHasMeaningfulBenefit && !bHasMeaningfulBenefit) {
        const performanceComparison = comparePerformanceProgress(a, b);
        if (performanceComparison !== 0) return performanceComparison;
    }
    return compareCombinations(a, b);
};

export function calculateBestCombinations(
    input: CombinationEngineInput,
    options: CombinationEngineOptions = {},
): RecommendationResponse {
    const startedAt = globalThis.performance?.now() ?? Date.now();
    const maxWorkingStates = Number.isFinite(options.maxWorkingStates) &&
        (options.maxWorkingStates ?? 0) > 0
        ? Math.max(1, Math.floor(options.maxWorkingStates as number))
        : DEFAULT_MAX_WORKING_STATES;
    const maxStateTransitions = Number.isFinite(options.maxStateTransitions) &&
        (options.maxStateTransitions ?? 0) > 0
        ? Math.max(1, Math.floor(options.maxStateTransitions as number))
        : DEFAULT_MAX_STATE_TRANSITIONS;
    const metrics: CombinationEngineMetrics = {
        matchingOfferCount: 0,
        calculableOfferCount: 0,
        peakWorkingStateCount: 1,
        prunedWorkingStateCount: 0,
        stateTransitionCount: 0,
        generatedCombinationCount: 0,
        prunedCombinationCount: 0,
        returnedCombinationCount: 0,
        searchSpaceLimited: false,
        durationMs: 0,
    };
    const enumerationContext: EnumerationContext = {
        maxWorkingStates,
        maxStateTransitions,
        metrics,
    };
    const now = input.now ?? new Date();
    const providerById = new Map(input.providers.map(provider => [provider.id, provider]));
    const smallBenefitThreshold = input.profile.smallBenefitThreshold ??
        DEFAULT_SMALL_BENEFIT_THRESHOLD;
    const compareResults = input.priority === 'PERFORMANCE'
        ? comparePerformanceCombinations
        : (a: BenefitCombination, b: BenefitCombination) => compareBenefitCombinations(
            a,
            b,
            smallBenefitThreshold,
        );
    const confirmedConditionIds = new Set(input.confirmedConditionIds ?? []);
    const currentOffers = input.promotions.filter(offer =>
        isPublishedAndCurrent(offer, now) &&
        matchesPaymentTarget(offer, input.target) &&
        matchesChannel(offer, input.isOnline) &&
        isTelecomEligible(offer, providerById.get(offer.providerId), input.profile) &&
        isSubscriptionEligible(offer, providerById.get(offer.providerId), input.profile)
    );
    metrics.matchingOfferCount = currentOffers.length;
    const isItemScoped = (offer: PromotionOffer) =>
        offer.condition.applicabilityScope === 'CATEGORY' ||
        offer.condition.applicabilityScope === 'PRODUCT_SET' ||
        offer.condition.itemSpecific === true ||
        offer.condition.amountBasis === 'ELIGIBLE_ITEM_AMOUNT';
    const isInformationOnly = (offer: PromotionOffer) =>
        offer.action.valueSemantics === 'UP_TO' ||
        offer.condition.calculationMode === 'INFORMATION_ONLY';
    const isHeadlineEligible = (offer: PromotionOffer) => {
        if (isInformationOnly(offer)) return false;
        if (offer.condition.applicabilityScope) {
            return offer.condition.applicabilityScope === 'STORE_WIDE' &&
                offer.condition.headlineEligible !== false;
        }
        return !isItemScoped(offer);
    };
    const isWholePurchaseConditional = (offer: PromotionOffer) =>
        offer.condition.calculationMode === 'CONDITIONAL' &&
        offer.condition.applicabilityScope === 'CUSTOMER_TARGETED';
    const promotionItemSpecificOffers = currentOffers
        .filter(offer => isItemScoped(offer) && !isInformationOnly(offer))
        .map(offer => ({
            id: offer.id,
            title: offer.title,
            providerName: getOfferProviderName(
                offer,
                providerById.get(offer.providerId),
                input.profile,
            ),
            scope: offer.condition.applicabilityScope === 'CATEGORY'
                ? 'CATEGORY' as const
                : 'PRODUCT_SET' as const,
            calculationEligible: !isInformationOnly(offer),
            valueSemantics: offer.action.valueSemantics ?? 'EXACT',
            actionType: offer.action.type,
            actionValue: offer.action.value,
            ...(offer.condition.eligibleItemSummary && {
                eligibleItemSummary: offer.condition.eligibleItemSummary,
            }),
            ...(offer.condition.requiredNote && {
                requiredNote: offer.condition.requiredNote,
            }),
        }));
    const currentDate = now.toISOString().slice(0, 10);
    const cardItemSpecificOffers = input.rules
        .filter(rule => {
            if (input.target.kind === 'GENERAL') return false;
            if (rule.condition.itemSpecific !== true) return false;
            if ((rule.excludedBrands ?? []).includes(input.target.brand.id)) return false;
            const includedBrands = rule.includedBrands ?? [];
            const matches = includedBrands.includes(input.target.brand.id) ||
                (includedBrands.length === 0 && rule.category === input.target.brand.categoryId);
            if (!matches) return false;
            if (rule.platformType === 'ONLINE' || rule.platformType === 'OFFICIAL_SITE') {
                if (!input.isOnline) return false;
            }
            if (rule.platformType === 'OFFLINE' && input.isOnline) return false;
            if (rule.condition.startsAt && rule.condition.startsAt > currentDate) return false;
            if (rule.condition.endsAt && rule.condition.endsAt < currentDate) return false;
            return input.cards.some(card => card.id === rule.cardId);
        })
        .map(rule => ({
            id: rule.id,
            title: rule.description,
            providerName: input.cards.find(card => card.id === rule.cardId)?.name ?? rule.cardId,
            scope: 'PRODUCT_SET' as const,
            calculationEligible: true,
            valueSemantics: 'EXACT' as const,
            actionType: rule.action.type,
            actionValue: rule.action.value,
            ...(rule.condition.eligibleItemSummary && {
                eligibleItemSummary: rule.condition.eligibleItemSummary,
            }),
            ...(rule.condition.requiredNote && {
                requiredNote: rule.condition.requiredNote,
            }),
        }));
    const itemSpecificOffers = [
        ...promotionItemSpecificOffers,
        ...cardItemSpecificOffers,
    ];
    const informationalOffers = currentOffers
        .filter(isInformationOnly)
        .map(offer => ({
            id: offer.id,
            title: offer.title,
            providerName: getOfferProviderName(
                offer,
                providerById.get(offer.providerId),
                input.profile,
            ),
            scope: offer.condition.applicabilityScope ?? 'UNKNOWN',
            valueSemantics: offer.action.valueSemantics ?? 'EXACT',
            calculationMode: 'INFORMATION_ONLY' as const,
            actionType: offer.action.type,
            actionValue: offer.action.value,
            ...(offer.condition.eligibleItemSummary && {
                eligibleItemSummary: offer.condition.eligibleItemSummary,
            }),
            ...(offer.condition.requiredNote && {
                requiredNote: offer.condition.requiredNote,
            }),
        }));
    const calculableOffers = currentOffers.filter(offer =>
        !isInformationOnly(offer) && (
            isHeadlineEligible(offer) ||
            isWholePurchaseConditional(offer) ||
            (isItemScoped(offer) && Boolean(input.eligibleItemAmount))
        )
    );
    metrics.calculableOfferCount = calculableOffers.length;

    const payProviderIds = uniqueStrings(input.profile.enabledPayProviderIds);
    const payOptions: Array<string | undefined> = [undefined, ...payProviderIds];
    const discountOffers = calculableOffers.filter(offer => offer.layer === 'DISCOUNT');
    const payOffers = calculableOffers.filter(offer => offer.layer === 'PAY');
    const rewardOffers = calculableOffers.filter(offer => offer.layer === 'POST_REWARD');
    let results: BenefitCombination[] = [];
    const resultBufferLimit = Math.max(30, maxWorkingStates);
    const retainBestResults = () => {
        const before = results.length;
        results = [...new Map(results.map(item => [item.id, item])).values()]
            .sort(compareResults)
            .slice(0, resultBufferLimit);
        metrics.prunedCombinationCount += before - results.length;
    };
    const collectResult = (combination: BenefitCombination) => {
        metrics.generatedCombinationCount += 1;
        results.push(combination);
        if (results.length >= resultBufferLimit * 2) retainBestResults();
    };

    payOptions.forEach(payProviderId => {
        const initial: WorkingCombination = {
            remainingAmount: input.amount,
            steps: [],
            appliedPromotionIds: new Set(),
            exclusiveGroups: new Set(),
            confirmedValue: 0,
            conditionalValue: 0,
            estimatedValue: 0,
            immediateDiscount: 0,
            laterReward: 0,
            warnings: [],
            requiredChecks: [],
            blocksCardBenefit: false,
        };
        const afterDiscount = enumerateOfferSubsets(
            [initial],
            discountOffers,
            input,
            providerById,
            confirmedConditionIds,
            enumerationContext,
            payProviderId,
        );
        const afterPay = enumerateOfferSubsets(
            afterDiscount,
            payOffers.filter(offer =>
                offer.providerId === payProviderId ||
                (offer.compatibility.requiredPayProviderIds ?? []).includes(payProviderId ?? '')
            ),
            input,
            providerById,
            confirmedConditionIds,
            enumerationContext,
            payProviderId,
        );

        afterPay.forEach(state => {
            const fundingOptions: FundingType[] = payProviderId
                ? [
                    'CARD',
                    ...(input.profile.moneyEnabled ? ['MONEY' as const] : []),
                    ...(input.profile.pointsEnabled ? ['POINTS' as const] : []),
                    ...(state.steps.some(step =>
                        step.promotionId &&
                        input.promotions.find(offer => offer.id === step.promotionId)
                            ?.action.type === 'GIFT_CERTIFICATE'
                    ) ? ['GIFT_CERTIFICATE' as const] : []),
                ]
                : ['CARD'];

            fundingOptions.forEach(fundingType => {
                const incompatibleFunding = state.steps.some(step => {
                    if (!step.promotionId) return false;
                    const offer = input.promotions.find(item => item.id === step.promotionId);
                    const allowed = offer?.compatibility.allowedFundingTypes ?? [];
                    return allowed.length > 0 && !allowed.includes(fundingType);
                });
                if (incompatibleFunding) return;

                if (fundingType === 'CARD') {
                    input.cards.forEach(card => {
                        let next = cloneWorking(state);
                        const cardCharge = next.cardChargeBase ?? next.remainingAmount;
                        next.cardChargeAmount = cardCharge;
                        if (!next.blocksCardBenefit) {
                            const evaluatedCard = calculateBestCards(
                                cardCharge,
                                input.target,
                                [card],
                                input.rules,
                                input.history,
                                input.performances,
                                input.isOnline,
                                {
                                    confirmedConditionIds,
                                    now: input.now,
                                    ...(input.eligibleItemAmount !== undefined && {
                                        eligibleItemAmount: input.eligibleItemAmount,
                                    }),
                                },
                            )[0];
                            if (evaluatedCard) {
                                const route = getRouteCertainty(input, card, payProviderId);
                                next = addCardSteps(next, evaluatedCard, route);
                            }
                        } else {
                            next.warnings.push('이 혜택은 등록 카드 혜택과 중복되지 않아요.');
                        }
                        const afterRewards = enumerateOfferSubsets(
                            [next],
                            rewardOffers,
                            input,
                            providerById,
                            confirmedConditionIds,
                            enumerationContext,
                            payProviderId,
                            fundingType,
                        );
                        afterRewards.forEach(finalState => {
                            collectResult(toCombination(
                                finalState,
                                providerById,
                                payProviderId,
                                fundingType,
                                card,
                                input,
                            ));
                        });
                    });
                    return;
                }

                const afterRewards = enumerateOfferSubsets(
                    [state],
                    rewardOffers,
                    input,
                    providerById,
                    confirmedConditionIds,
                    enumerationContext,
                    payProviderId,
                    fundingType,
                );
                afterRewards.forEach(finalState => {
                    collectResult(toCombination(
                        finalState,
                        providerById,
                        payProviderId,
                        fundingType,
                        undefined,
                        input,
                    ));
                });
            });
        });
    });

    const deduplicated = [...new Map(results.map(item => [item.id, item])).values()]
        .sort(compareResults)
        .slice(0, 30)
        .map(combination => metrics.searchSpaceLimited
            ? {
                ...combination,
                warnings: uniqueStrings([...combination.warnings, LIMITED_SEARCH_WARNING]),
            }
            : combination);

    metrics.returnedCombinationCount = deduplicated.length;
    metrics.durationMs = (globalThis.performance?.now() ?? Date.now()) - startedAt;
    options.onMetrics?.({ ...metrics });

    return {
        ...(input.target.kind === 'BRAND' && { brandId: input.target.brand.id }),
        target: toPaymentTargetSnapshot(input.target),
        amount: input.amount,
        ...(input.eligibleItemAmount && { eligibleItemAmount: input.eligibleItemAmount }),
        combinations: deduplicated,
        itemSpecificOffers,
        informationalOffers,
    };
}
