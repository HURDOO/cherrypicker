import { createHash } from 'node:crypto';
import type {
    BenefitCertainty,
    BenefitCombination,
    BenefitRule,
    Brand,
    CalculatedCard,
    Card,
    CombinationStep,
    FundingType,
    MerchantRouteVerification,
    PromotionOffer,
    PromotionProvider,
    RecommendationRequest,
    RecommendationResponse,
    TransactionHistory,
    UserBenefitProfile,
    UserCardPerformance,
} from '@/types';
import { calculateBestCards } from './calculation';

type WorkingCombination = {
    remainingAmount: number;
    cardChargeBase?: number;
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

export type CombinationEngineInput = RecommendationRequest & {
    brand: Brand;
    cards: Card[];
    rules: BenefitRule[];
    history: TransactionHistory[];
    performances: UserCardPerformance[];
    promotions: PromotionOffer[];
    providers: PromotionProvider[];
    profile: UserBenefitProfile;
    routeVerifications?: MerchantRouteVerification[];
    promotionUsage?: Record<string, {
        dailyCount: number;
        monthlyCount: number;
        yearlyCount: number;
        monthlyAmount: number;
    }>;
    now?: Date;
};

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

const getBenefitAmount = (offer: PromotionOffer, basisAmount: number) => {
    const { action } = offer;
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

const matchesBrand = (offer: PromotionOffer, brand: Brand) =>
    offer.brandIds.includes(brand.id) ||
    offer.categoryIds.includes(brand.categoryId) ||
    (offer.brandIds.length === 0 && offer.categoryIds.length === 0);

const isTelecomEligible = (
    offer: PromotionOffer,
    provider: PromotionProvider | undefined,
    profile: UserBenefitProfile,
) => {
    if (provider?.kind !== 'TELECOM') return true;
    const membership = profile.telecomMemberships.find(item => item.providerId === provider.id);
    if (!membership) return false;
    const allowedTiers = offer.condition.telecomTiers ?? [];
    return allowedTiers.length === 0 || Boolean(
        membership.tier && allowedTiers.includes(membership.tier)
    );
};

const getEffectiveCertainty = (
    offer: PromotionOffer,
    confirmedConditionIds: Set<string>,
): BenefitCertainty => {
    const needsConfirmation = offer.condition.requiresCoupon ||
        offer.condition.requiresEnrollment ||
        offer.condition.firstPaymentOnly ||
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
    if (offer.limitConfig.monthlyAmount) {
        benefitAmount = Math.min(
            benefitAmount,
            Math.max(0, offer.limitConfig.monthlyAmount - (usage?.monthlyAmount ?? 0))
        );
    }
    if (benefitAmount <= 0) return null;

    const certainty = getEffectiveCertainty(offer, confirmedConditionIds);
    const isImmediate = immediateActionTypes.has(offer.action.type);
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
        providerName: providerById.get(offer.providerId)?.name ?? offer.providerId,
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

const enumerateOfferSubsets = (
    initialStates: WorkingCombination[],
    offers: PromotionOffer[],
    input: CombinationEngineInput,
    providerById: Map<string, PromotionProvider>,
    confirmedConditionIds: Set<string>,
    payProviderId?: string,
    fundingType?: FundingType,
) => offers.reduce<WorkingCombination[]>((states, offer) => {
    const added = states.flatMap(state => {
        if (!canApplyOffer(offer, state, payProviderId, input.promotions, fundingType)) return [];
        const applied = applyOffer(
            offer,
            state,
            input,
            providerById,
            confirmedConditionIds,
        );
        return applied ? [applied] : [];
    });
    return [...states, ...added];
}, initialStates);

const getRouteCertainty = (
    input: CombinationEngineInput,
    card: Card,
    payProviderId?: string,
): { eligible: boolean; certainty: BenefitCertainty; warning?: string } => {
    if (!payProviderId) return { eligible: true, certainty: 'CONFIRMED' };
    const requestedChannel = input.isOnline ? 'ONLINE' : 'OFFLINE';
    const verification = input.routeVerifications?.find(item =>
        item.brandId === input.brand.id &&
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

const addCardStep = (
    state: WorkingCombination,
    card: CalculatedCard,
    route: ReturnType<typeof getRouteCertainty>,
) => {
    const next = cloneWorking(state);
    if (!route.eligible || card.calculatedDiscount <= 0) {
        if (route.warning) next.warnings.push(route.warning);
        return next;
    }

    const benefitAmount = Math.min(next.remainingAmount, card.calculatedDiscount);
    addValue(next, route.certainty, benefitAmount);
    next.immediateDiscount += benefitAmount;
    const amountBefore = next.remainingAmount;
    next.remainingAmount = Math.max(0, next.remainingAmount - benefitAmount);
    if (route.warning) next.warnings.push(route.warning);
    next.steps.push({
        id: `card:${card.id}:${card.matchedRule?.id ?? 'none'}`,
        layer: 'PAYMENT_METHOD',
        providerName: card.company,
        title: card.matchedRule?.description ?? `${card.name} 카드 혜택`,
        certainty: route.certainty,
        amountBefore,
        benefitAmount,
        amountAfter: next.remainingAmount,
        isImmediate: true,
        cardId: card.id,
        ...(card.matchedRule?.id && { ruleId: card.matchedRule.id }),
        ...(route.warning && { warning: route.warning }),
    });
    return next;
};

const combinationId = (
    state: WorkingCombination,
    payProviderId: string | undefined,
    fundingType: FundingType,
    cardId?: string,
) => createHash('sha256')
    .update(JSON.stringify({
        payProviderId,
        fundingType,
        cardId,
        steps: state.steps.map(step => step.id),
    }))
    .digest('hex')
    .slice(0, 20);

const toCombination = (
    state: WorkingCombination,
    providerById: Map<string, PromotionProvider>,
    payProviderId: string | undefined,
    fundingType: FundingType,
    card?: Card,
): BenefitCombination => ({
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
    warnings: uniqueStrings(state.warnings),
    requiredChecks: uniqueStrings(state.requiredChecks),
});

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
    return bPotential - aPotential;
};

export function calculateBestCombinations(input: CombinationEngineInput): RecommendationResponse {
    const now = input.now ?? new Date();
    const providerById = new Map(input.providers.map(provider => [provider.id, provider]));
    const confirmedConditionIds = new Set(input.confirmedConditionIds ?? []);
    const currentOffers = input.promotions.filter(offer =>
        isPublishedAndCurrent(offer, now) &&
        matchesBrand(offer, input.brand) &&
        matchesChannel(offer, input.isOnline) &&
        isTelecomEligible(offer, providerById.get(offer.providerId), input.profile)
    );
    const itemSpecificOffers = currentOffers
        .filter(offer =>
            offer.condition.amountBasis === 'ELIGIBLE_ITEM_AMOUNT' &&
            !input.eligibleItemAmount
        )
        .map(offer => ({
            id: offer.id,
            title: offer.title,
            providerName: providerById.get(offer.providerId)?.name ?? offer.providerId,
            ...(offer.condition.requiredNote && {
                requiredNote: offer.condition.requiredNote,
            }),
        }));
    const calculableOffers = currentOffers.filter(offer =>
        offer.condition.amountBasis !== 'ELIGIBLE_ITEM_AMOUNT' ||
        Boolean(input.eligibleItemAmount)
    );

    const payProviderIds = uniqueStrings(input.profile.enabledPayProviderIds);
    const payOptions: Array<string | undefined> = [undefined, ...payProviderIds];
    const discountOffers = calculableOffers.filter(offer => offer.layer === 'DISCOUNT');
    const payOffers = calculableOffers.filter(offer => offer.layer === 'PAY');
    const rewardOffers = calculableOffers.filter(offer => offer.layer === 'POST_REWARD');
    const results: BenefitCombination[] = [];

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
                        if (!next.blocksCardBenefit) {
                            const cardCharge = next.cardChargeBase ?? next.remainingAmount;
                            const evaluatedCard = calculateBestCards(
                                cardCharge,
                                input.brand,
                                [card],
                                input.rules,
                                input.history,
                                input.performances,
                                input.isOnline,
                            )[0];
                            if (evaluatedCard) {
                                const route = getRouteCertainty(input, card, payProviderId);
                                next = addCardStep(next, evaluatedCard, route);
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
                            payProviderId,
                            fundingType,
                        );
                        afterRewards.forEach(finalState => {
                            results.push(toCombination(
                                finalState,
                                providerById,
                                payProviderId,
                                fundingType,
                                card,
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
                    payProviderId,
                    fundingType,
                );
                afterRewards.forEach(finalState => {
                    results.push(toCombination(
                        finalState,
                        providerById,
                        payProviderId,
                        fundingType,
                    ));
                });
            });
        });
    });

    const deduplicated = [...new Map(results.map(item => [item.id, item])).values()]
        .sort(compareCombinations)
        .slice(0, 30);

    return {
        brandId: input.brand.id,
        amount: input.amount,
        ...(input.eligibleItemAmount && { eligibleItemAmount: input.eligibleItemAmount }),
        combinations: deduplicated,
        itemSpecificOffers,
    };
}
