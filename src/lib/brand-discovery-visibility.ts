import type { BenefitRule, Brand, PromotionOffer } from '@/types';
import { isInformationalCardRule } from '@/utils/calculation';

/** Everyday payment categories (PROJECT_BRIEF §8) whose brands may surface in browse lists on their own. */
export const EVERYDAY_DISCOVERY_CATEGORY_IDS: ReadonlySet<string> = new Set([
    'convenience',
    'cafe',
    'food',
    'delivery',
    'transport',
    'shopping',
    'subscription',
]);

const isLive = (offer: PromotionOffer, today: string) => (
    offer.status === 'PUBLISHED' &&
    (!offer.startsAt || offer.startsAt <= today) &&
    (!offer.endsAt || offer.endsAt >= today)
);


/**
 * Brands stored as `AUTO` appear in browse lists while they carry a benefit worth finding: a
 * computed benefit of a published card, or a live promotion in an everyday category. Otherwise
 * they stay search-only, so expired or one-off promotions do not clutter category lists.
 */
export function autoBrowsableBrandIds(input: {
    brands: ReadonlyArray<Pick<Brand, 'id' | 'categoryId'>>;
    publishedCardIds: ReadonlySet<string>;
    rules: readonly BenefitRule[];
    promotions: readonly PromotionOffer[];
    today: string;
}): Set<string> {
    const cardBenefitBrandIds = new Set(input.rules
        .filter(rule => input.publishedCardIds.has(rule.cardId) && !isInformationalCardRule(rule))
        .flatMap(rule => rule.includedBrands ?? []));
    const promotedBrandIds = new Set(input.promotions
        .filter(offer => isLive(offer, input.today))
        .flatMap(offer => offer.brandIds));
    return new Set(input.brands
        .filter(brand => cardBenefitBrandIds.has(brand.id) || (
            promotedBrandIds.has(brand.id) && EVERYDAY_DISCOVERY_CATEGORY_IDS.has(brand.categoryId)
        ))
        .map(brand => brand.id));
}
