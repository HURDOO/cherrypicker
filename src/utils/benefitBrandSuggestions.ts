import type {
    BenefitRule,
    Brand,
    Card,
    MerchantRouteVerification,
    PromotionOffer,
    PromotionProvider,
    TransactionHistory,
    UserBenefitProfile,
    UserCardPerformance,
} from '@/types';
import { POPULAR_BRAND_IDS } from '@/utils/brandDiscovery';
import { calculateBestCombinations } from '@/utils/combination';
import { getCombinationMethodSummary } from '@/utils/combinationPresentation';

const DEFAULT_SAMPLE_AMOUNT = 10_000;

export interface BenefitBrandSuggestion {
    brand: Brand;
    sampleAmount: number;
    benefitAmount: number;
    benefitCount: number;
    methodSummary: string;
}

export interface BenefitBrandSuggestionResult {
    suggestions: BenefitBrandSuggestion[];
    opportunityCount: number;
}

interface RankBenefitBrandSuggestionsInput {
    brands: Brand[];
    cards: Card[];
    rules: BenefitRule[];
    history: TransactionHistory[];
    performances: UserCardPerformance[];
    promotions: PromotionOffer[];
    providers: PromotionProvider[];
    profile: UserBenefitProfile;
    favoriteBrandIds?: string[];
    routeVerifications?: MerchantRouteVerification[];
    promotionUsage?: Record<string, {
        dailyCount: number;
        dailyAmount?: number;
        monthlyCount: number;
        yearlyCount: number;
        monthlyAmount: number;
    }>;
    performanceBenefitMonth?: string;
    isOnline?: boolean;
    now?: Date;
    limit?: number;
}

const matchesChannel = (channels: PromotionOffer['channels'], isOnline: boolean) => (
    channels.includes('ALL') || (isOnline
        ? channels.includes('ONLINE') || channels.includes('OFFICIAL_SITE')
        : channels.includes('OFFLINE'))
);

const offerMatchesBrandScope = (offer: PromotionOffer, brand: Brand) => (
    offer.brandIds.includes(brand.id) ||
    offer.categoryIds.includes(brand.categoryId) ||
    (offer.brandIds.length === 0 && offer.categoryIds.length === 0)
);

const ruleMatchesBrandScope = (rule: BenefitRule, brand: Brand) => {
    if ((rule.excludedBrands ?? []).includes(brand.id)) return false;
    const includedBrandIds = rule.includedBrands ?? [];
    if (includedBrandIds.includes(brand.id)) return true;
    return includedBrandIds.length === 0 && rule.category === brand.categoryId;
};

const getRuleSampleAmount = (rule: BenefitRule) => {
    const minimum = Math.max(1, rule.condition.minSpend ?? 0);
    const inclusiveMaximum = rule.condition.maxSpend ?? Number.POSITIVE_INFINITY;
    const exclusiveMaximum = rule.condition.maxSpendExclusive === undefined
        ? Number.POSITIVE_INFINITY
        : rule.condition.maxSpendExclusive - 1;
    const maximum = Math.min(inclusiveMaximum, exclusiveMaximum);
    if (maximum < minimum || maximum <= 0) return undefined;
    return Math.floor(Math.min(maximum, Math.max(DEFAULT_SAMPLE_AMOUNT, minimum)));
};

const isCurrentPromotion = (offer: PromotionOffer, now: Date) => (
    offer.status === 'PUBLISHED' &&
    (!offer.startsAt || new Date(offer.startsAt) <= now) &&
    (!offer.endsAt || new Date(offer.endsAt) >= now)
);

export function rankBenefitBrandSuggestions({
    brands,
    cards,
    rules,
    history,
    performances,
    promotions,
    providers,
    profile,
    favoriteBrandIds = [],
    routeVerifications,
    promotionUsage,
    performanceBenefitMonth,
    isOnline = false,
    now = new Date(),
    limit = 6,
}: RankBenefitBrandSuggestionsInput): BenefitBrandSuggestionResult {
    const cardIds = new Set(cards.map(card => card.id));
    const favoriteRanks = new Map<string, number>(
        favoriteBrandIds.map((id, index) => [id, index])
    );
    const popularRanks = new Map<string, number>(
        POPULAR_BRAND_IDS.map((id, index) => [id, index])
    );
    const brandUsage = new Map<string, number>();
    history.forEach(transaction => {
        if (!transaction.brandId) return;
        brandUsage.set(transaction.brandId, (brandUsage.get(transaction.brandId) ?? 0) + 1);
    });

    const candidates = brands.flatMap<BenefitBrandSuggestion>(brand => {
        const scopedRules = rules.filter(rule => (
            cardIds.has(rule.cardId) &&
            rule.action.value > 0 &&
            rule.condition.itemSpecific !== true &&
            (isOnline
                ? rule.platformType !== 'OFFLINE'
                : rule.platformType !== 'ONLINE' && rule.platformType !== 'OFFICIAL_SITE') &&
            ruleMatchesBrandScope(rule, brand)
        ));
        const scopedPromotions = promotions.filter(offer => (
            isCurrentPromotion(offer, now) &&
            matchesChannel(offer.channels, isOnline) &&
            offer.action.value > 0 &&
            offer.condition.itemSpecific !== true &&
            offer.condition.applicabilityScope !== 'CATEGORY' &&
            offer.condition.applicabilityScope !== 'PRODUCT_SET' &&
            offer.condition.calculationMode !== 'INFORMATION_ONLY' &&
            offer.action.valueSemantics !== 'UP_TO' &&
            offerMatchesBrandScope(offer, brand)
        ));
        if (scopedRules.length === 0 && scopedPromotions.length === 0) return [];

        const sampleAmounts = [...new Set([
            DEFAULT_SAMPLE_AMOUNT,
            ...scopedRules
                .map(getRuleSampleAmount)
                .filter((amount): amount is number => amount !== undefined),
            ...scopedPromotions
                .map(offer => offer.condition.minSpend)
                .filter((amount): amount is number => amount !== undefined && amount > 0),
        ])].slice(0, 4);

        const brandCandidates = sampleAmounts.flatMap<BenefitBrandSuggestion>(sampleAmount => {
            const response = calculateBestCombinations({
                target: { kind: 'BRAND', brand },
                amount: sampleAmount,
                isOnline,
                priority: 'BENEFIT',
                cards,
                rules,
                history,
                performances,
                promotions,
                providers,
                profile,
                performanceGoals: [],
                performanceBenefitMonth,
                routeVerifications,
                promotionUsage,
                now,
            });
            const combination = response.combinations.find(item => item.confirmedValue > 0);
            if (!combination) return [];
            const benefitCount = combination.steps.filter(step => (
                step.certainty === 'CONFIRMED' && step.benefitAmount > 0
            )).length;
            if (benefitCount === 0) return [];

            return [{
                brand,
                sampleAmount,
                benefitAmount: combination.confirmedValue,
                benefitCount,
                methodSummary: getCombinationMethodSummary(combination),
            }];
        });
        if (brandCandidates.length === 0) return [];

        return [brandCandidates.sort((left, right) => (
            right.benefitAmount / right.sampleAmount - left.benefitAmount / left.sampleAmount ||
            right.benefitCount - left.benefitCount ||
            right.benefitAmount - left.benefitAmount ||
            left.sampleAmount - right.sampleAmount
        ))[0]];
    }).sort((left, right) => {
        const leftFavoriteRank = favoriteRanks.get(left.brand.id) ?? Number.POSITIVE_INFINITY;
        const rightFavoriteRank = favoriteRanks.get(right.brand.id) ?? Number.POSITIVE_INFINITY;
        const leftPopularRank = popularRanks.get(left.brand.id) ?? Number.POSITIVE_INFINITY;
        const rightPopularRank = popularRanks.get(right.brand.id) ?? Number.POSITIVE_INFINITY;

        return leftFavoriteRank - rightFavoriteRank ||
            (brandUsage.get(right.brand.id) ?? 0) - (brandUsage.get(left.brand.id) ?? 0) ||
            leftPopularRank - rightPopularRank ||
            right.benefitAmount / right.sampleAmount - left.benefitAmount / left.sampleAmount ||
            right.benefitCount - left.benefitCount ||
            right.benefitAmount - left.benefitAmount ||
            left.brand.name.localeCompare(right.brand.name, 'ko-KR');
    });

    return {
        suggestions: candidates.slice(0, Math.max(0, limit)),
        opportunityCount: candidates.length,
    };
}
